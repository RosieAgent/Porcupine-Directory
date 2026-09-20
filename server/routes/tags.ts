import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { tagEditSchema } from "../../shared/tags.js";
import {
  requireStaff,
  requireCurrentSession,
  transaction,
  HttpError,
} from "../security.js";

export const tags = Router();
tags.get("/", async (_req, res) => {
  const { rows } =
    await pool.query(`SELECT d.id,d.name,d.icon,d.retired,d.merged_into AS "mergedInto",d.version,
    ARRAY(SELECT n.name FROM tag_names n WHERE n.tag_id=d.id AND n.key<>lower(d.name) ORDER BY n.name) AS aliases,
    (SELECT count(*)::int FROM listings l WHERE l.status='published' AND EXISTS
      (SELECT 1 FROM tag_names n WHERE n.tag_id=d.id AND n.key=ANY(SELECT lower(t) FROM unnest(l.tags) t))) AS count
    FROM tag_definitions d ORDER BY lower(d.name),d.id`);
  res.json({ items: rows });
});
async function putNames(
  client: import("pg").PoolClient,
  id: string,
  names: string[],
) {
  for (const name of names) {
    const key = name.toLowerCase();
    const old = await client.query(
      "SELECT tag_id FROM tag_names WHERE key=$1",
      [key],
    );
    if (old.rows[0] && old.rows[0].tag_id !== id)
      throw new HttpError(
        409,
        "That name or alias already belongs to another tag.",
      );
    await client.query(
      "INSERT INTO tag_names(key,name,tag_id) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING",
      [key, name, id],
    );
  }
}
async function revise(
  client: import("pg").PoolClient,
  id: string,
  actor: string,
  action: string,
  reason: string,
  before: unknown,
) {
  await client.query(
    `INSERT INTO tag_revisions(tag_id,actor_id,action,reason,before_data,after_data)
    SELECT id,$2,$3,$4,$5::jsonb,to_jsonb(d) || jsonb_build_object('aliases',(SELECT jsonb_agg(name) FROM tag_names WHERE tag_id=d.id)) FROM tag_definitions d WHERE id=$1`,
    [id, actor, action, reason, JSON.stringify(before)],
  );
}
tags.post("/", requireStaff, async (req, res) => {
  const data = tagEditSchema.parse(req.body);
  const id = await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const { rows } = await client.query(
      "INSERT INTO tag_definitions(name,icon,retired) VALUES ($1,$2,$3) RETURNING id",
      [data.name, data.icon, data.retired],
    );
    const id = rows[0].id as string;
    await putNames(client, id, [data.name, ...data.aliases]);
    await revise(client, id, req.account!.id, "create", data.reason, null);
    return id;
  });
  res.status(201).json({ id });
});
tags.put("/:id", requireStaff, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = tagEditSchema
    .extend({ version: z.number().int().positive() })
    .parse(req.body);
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const { rows } = await client.query(
      "SELECT * FROM tag_definitions WHERE id=$1 FOR UPDATE",
      [id],
    );
    const old = rows[0];
    if (!old || old.version !== data.version || old.merged_into)
      throw new HttpError(409, "Tag changed. Reload the catalog.");
    await putNames(client, id, [data.name, ...data.aliases]);
    await client.query(
      "UPDATE tag_definitions SET name=$2,icon=$3,retired=$4,version=version+1 WHERE id=$1",
      [id, data.name, data.icon, data.retired],
    );
    if (old.name !== data.name) {
      await client.query(
        "SELECT set_config('app.actor',$1,true),set_config('app.action','tag-renamed',true),set_config('app.reason',$2,true)",
        [req.account!.id, data.reason],
      );
      await client.query(
        `UPDATE listings l SET tags=ARRAY(SELECT DISTINCT CASE WHEN lower(t) IN (SELECT key FROM tag_names WHERE tag_id=$1) THEN $2 ELSE t END FROM unnest(l.tags) t),locally_edited=true
        WHERE EXISTS (SELECT 1 FROM unnest(l.tags) t JOIN tag_names n ON n.key=lower(t) WHERE n.tag_id=$1)`,
        [id, data.name],
      );
    }
    await revise(client, id, req.account!.id, "update", data.reason, old);
  });
  res.json({ ok: true });
});
tags.post("/:id/merge", requireStaff, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = z
    .object({
      targetId: z.uuid(),
      version: z.number().int().positive(),
      targetVersion: z.number().int().positive(),
      reason: z.string().trim().min(3).max(300),
    })
    .parse(req.body);
  if (id === data.targetId)
    throw new HttpError(400, "Choose a different target tag.");
  await transaction(async (client) => {
    await requireCurrentSession(client, req);
    await client.query("SELECT pg_advisory_xact_lock(4350010)");
    const { rows } = await client.query(
      "SELECT * FROM tag_definitions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [[id, data.targetId]],
    );
    const old = rows.find((r) => r.id === id),
      target = rows.find((r) => r.id === data.targetId);
    if (
      !old ||
      !target ||
      old.merged_into ||
      target.merged_into ||
      target.retired ||
      old.version !== data.version ||
      target.version !== data.targetVersion
    )
      throw new HttpError(
        409,
        "Tags changed or target is unavailable. Reload the catalog.",
      );
    await client.query(
      "SELECT set_config('app.actor',$1,true),set_config('app.action','tags-merged',true),set_config('app.reason',$2,true)",
      [req.account!.id, data.reason],
    );
    await client.query(
      `UPDATE listings l SET tags=ARRAY(SELECT DISTINCT CASE WHEN lower(t) IN (SELECT key FROM tag_names WHERE tag_id=$1) THEN $2 ELSE t END FROM unnest(l.tags) t),locally_edited=true
      WHERE EXISTS(SELECT 1 FROM unnest(l.tags) t JOIN tag_names n ON n.key=lower(t) WHERE n.tag_id=$1)`,
      [id, target.name],
    );
    await client.query("UPDATE tag_names SET tag_id=$2 WHERE tag_id=$1", [
      id,
      target.id,
    ]);
    await client.query(
      "UPDATE tag_definitions SET retired=true,merged_into=$2,version=version+1 WHERE id=$1 OR merged_into=$1",
      [id, target.id],
    );
    await client.query(
      "UPDATE tag_definitions SET version=version+1 WHERE id=$1",
      [target.id],
    );
    await revise(client, id, req.account!.id, "merge-source", data.reason, old);
    await revise(
      client,
      target.id,
      req.account!.id,
      "merge-target",
      data.reason,
      target,
    );
  });
  res.json({ ok: true });
});
tags.get("/:id/history", requireStaff, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const id = z.uuid().parse(req.params.id);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(1)
    .parse(req.query.page);
  const { rows } = await pool.query(
    'SELECT action,reason,before_data AS before,after_data AS after,created_at AS "createdAt" FROM tag_revisions WHERE tag_id=$1 ORDER BY id DESC LIMIT 20 OFFSET $2',
    [id, (page - 1) * 20],
  );
  res.json({ items: rows, page });
});
