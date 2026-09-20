# Hostinger VPS deployment

The repository is prepared for a Docker deployment on a Hostinger VPS. GitHub Actions tests the `production` branch, uploads a source archive over SSH, creates a release directory on the VPS, backs up PostgreSQL, and runs the production Compose stack. The server does not need a GitHub credential.

The production stack contains the app, PostgreSQL, a one-shot migration service, and Caddy. Caddy terminates HTTPS for `porcupinedirectory.com` and forwards traffic to the app over the private Compose network. PostgreSQL and the app port remain inaccessible from the public network.

## 1. Point the domain at the VPS

In Hostinger DNS, create an A record for `@` pointing to the VPS IPv4 address. If `www` should work, create a CNAME for `www` pointing to `porcupinedirectory.com` and add it to [`deploy/Caddyfile`](../deploy/Caddyfile). Hostinger says DNS propagation can take up to 24 hours; the VPS firewall must allow TCP 80 and 443 for web traffic. See Hostinger’s [domain-to-VPS guide](https://support.hostinger.com/en/articles/1583227-how-to-point-a-domain-to-your-vps).

## 2. Prepare the VPS

The Hostinger Ubuntu 24.04 Docker template includes Docker and Compose. If the VPS was created with another image, install Docker Engine and the Compose plugin first. Hostinger’s [Docker template guide](https://support.hostinger.com/en/articles/8306612-how-to-use-the-docker-vps-template) and [SSH guide](https://support.hostinger.com/en/articles/5723772-how-to-connect-to-your-vps-via-ssh) cover the initial connection.

Connect through Hostinger’s browser terminal or SSH as `root`, then create the deployment user and directories:

```bash
adduser --disabled-password --gecos "" porcupine-deploy
usermod -aG docker porcupine-deploy
install -d -o porcupine-deploy -g porcupine-deploy -m 0750 /opt/porcupine-directory
install -d -o porcupine-deploy -g porcupine-deploy -m 0750 /opt/porcupine-directory/releases
install -d -o porcupine-deploy -g porcupine-deploy -m 0700 /opt/porcupine-directory/backups
```

Create an SSH key pair on the trusted workstation that will administer GitHub Actions. Keep the private key local:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/porcupine-directory-production -C porcupine-directory-production
```

Put the public key in `/home/porcupine-deploy/.ssh/authorized_keys` with these restrictions before the key:

```text
restrict ssh-ed25519 AAAA... porcupine-directory-production
```

Set ownership and permissions, then test key login before changing SSH password settings:

```bash
install -d -o porcupine-deploy -g porcupine-deploy -m 0700 /home/porcupine-deploy/.ssh
chown porcupine-deploy:porcupine-deploy /home/porcupine-deploy/.ssh/authorized_keys
chmod 0600 /home/porcupine-deploy/.ssh/authorized_keys
ssh -i ~/.ssh/porcupine-directory-production porcupine-deploy@VPS_IP true
```

Allow SSH, HTTP, and HTTPS in both the Hostinger VPS firewall and the operating-system firewall. Keep password SSH disabled after key login is confirmed. Hostinger notes that an empty VPS firewall rule set drops all traffic, so explicitly add the required rules in hPanel; its [firewall guide](https://support.hostinger.com/en/articles/8172641-how-to-use-a-managed-vps-firewall) explains the process.

## 3. Create the production environment file

On the VPS, create `/opt/porcupine-directory/.env.production` with mode `600`. The repository includes [`deploy/prepare-production-env.sh`](../deploy/prepare-production-env.sh), which generates URL-safe database passwords and a session secret on the VPS without printing them:

```bash
ssh -i ~/.ssh/porcupine-directory-production \
  -l porcupine-deploy VPS_IP \
  'bash -s' < deploy/prepare-production-env.sh
```

The script writes the production values and does not send the secrets through chat or store them in the repository. If values such as the public bind address or SMTP settings differ, edit the script inputs before running it or update the file through a trusted SSH session.

If creating the file manually, start from [`deploy/production.env.example`](../deploy/production.env.example), replace every placeholder, and generate the important secrets on the VPS without sending them through chat:

```bash
openssl rand -hex 32  # POSTGRES_PASSWORD
openssl rand -hex 32  # APP_DB_PASSWORD; use a different value
openssl rand -base64 48  # SESSION_SECRET
openssl rand -hex 32  # EMAIL_ENCRYPTION_KEY, only if SMTP recovery is enabled
```

Use `https://porcupinedirectory.com` for `APP_ORIGIN`, set `PUBLIC_BIND_ADDRESS` to the VPS public IPv4 address, and keep `TRUST_PROXY=1` because Caddy is the single trusted reverse proxy for the public site. The explicit Caddy bind keeps private listeners such as Tailscale separate from public HTTPS. Leave the SMTP fields blank until a real TLS SMTP provider is ready. The database URLs must use the matching passwords; URL-encode any password characters outside letters, numbers, `-`, and `_`.

## 4. Configure the GitHub production environment

In the repository’s **Settings → Environments**, create an environment named `production` and require a reviewer for deployments. GitHub environment secrets are only released to jobs that reference that environment, and the environment can restrict which branches deploy; see the [GitHub environment documentation](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).

Add these environment variables:

| Name              | Value                            |
| ----------------- | -------------------------------- |
| `PRODUCTION_HOST` | VPS IPv4 address or SSH hostname |
| `PRODUCTION_USER` | `porcupine-deploy`               |
| `PRODUCTION_PATH` | `/opt/porcupine-directory`       |

Add these environment secrets:

| Name                         | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| `PRODUCTION_SSH_PRIVATE_KEY` | Contents of `~/.ssh/porcupine-directory-production` |
| `PRODUCTION_KNOWN_HOSTS`     | Verified `ssh-keyscan -H VPS_IP` output             |

Verify the VPS host-key fingerprint in Hostinger’s browser terminal before saving `PRODUCTION_KNOWN_HOSTS`. Do not generate the value from an unverified network connection. GitHub recommends least-privilege credentials and environment protection for deployment secrets; see its [secrets guidance](https://docs.github.com/en/actions/concepts/security/secrets).

## 5. Deploy

The `production` branch is the release branch. Push or merge a reviewed commit into it after the environment is configured:

```bash
git push origin production
```

The workflow runs the release checks, uploads the exact commit archive, creates a PostgreSQL backup, runs migrations in the owner container, starts the restricted app container and Caddy, and checks both the internal app health endpoint and `https://porcupinedirectory.com/api/health`. Caddy obtains and renews the HTTPS certificate after DNS resolves and ports 80/443 are reachable.

Open the URL in a browser and verify anonymous browsing, the account flow, the first administrator setup, and the public source status. The first administrator is created from the trusted host console after the first successful deployment; follow [`docs/accounts-and-trust.md`](accounts-and-trust.md).

## Rollback and routine operation

Backups are stored in `/opt/porcupine-directory/backups` with mode `600`. Release directories are stored under `/opt/porcupine-directory/releases`.

List available release SHAs:

```bash
find /opt/porcupine-directory/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
```

Rollback to a previously deployed SHA from a trusted SSH session:

```bash
sudo -u porcupine-deploy \
  PORCUPINE_ROOT=/opt/porcupine-directory \
  /opt/porcupine-directory/current/deploy/rollback-vps.sh FULL_COMMIT_SHA
```

Never use `docker compose down -v` on this production project. That removes the PostgreSQL volume. Keep an off-server copy of backups and perform a restore drill before treating the deployment as recoverable.
