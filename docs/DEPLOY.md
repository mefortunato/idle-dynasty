# Deploying Idle Dynasty to Cloud Run

One Cloud Run service serves both the API (`/api/*`) and the built SPA. GitHub Actions
(`.github/workflows/deploy.yml`) builds the image, pushes it to Artifact Registry and deploys on every push to `main`,
authenticating with Workload Identity Federation (no long-lived keys).

## One-time GCP setup

Run these in a shell with `gcloud` authenticated as a project owner.

```bash
# --- variables ---------------------------------------------------------------
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export REPO="mefortunato/idle-dynasty"
export AR_REPOSITORY="idle-dynasty"
export SERVICE="idle-dynasty"
export DEPLOYER_SA="idle-dynasty-deployer"
export POOL="github-pool"
export PROVIDER="github-provider"

gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
# Cloud Run runs as the default compute service account unless you create a dedicated one.
export RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# --- 1. enable APIs ----------------------------------------------------------
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com

# --- 2. Artifact Registry docker repo ---------------------------------------
gcloud artifacts repositories create "$AR_REPOSITORY" \
  --repository-format=docker --location="$REGION" \
  --description="Idle Dynasty images"

# --- 3. deployer service account + roles ------------------------------------
gcloud iam service-accounts create "$DEPLOYER_SA" --display-name="Idle Dynasty GitHub deployer"
export DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/artifactregistry.writer"
# Deployer may deploy revisions that run as the runtime SA
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/iam.serviceAccountUser"
# Runtime SA may read the Mongo secret (used only if USE_MONGODB=true)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor"

# --- 4. Workload Identity Pool + GitHub OIDC provider -----------------------
gcloud iam workload-identity-pools create "$POOL" \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='mefortunato/idle-dynasty'"

# Let identities from this repo impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"

export WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "$WIF_PROVIDER"
```

## Optional: MongoDB persistence

Without MongoDB the app uses an **in-memory store**: saves and leaderboards are lost whenever an instance restarts or
scales to zero, and each instance has its own separate data. Fine for a demo, not for real players.

1. Create a free **MongoDB Atlas** M0 cluster (https://www.mongodb.com/atlas) and a database user.
2. Under *Network Access* add `0.0.0.0/0` (Cloud Run has no fixed egress IPs unless you set up a VPC + NAT; the database
   user's strong password is then your protection).
3. Store the connection string (`mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true`) as a secret:

```bash
printf '%s' 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority' | \
  gcloud secrets create idle-dynasty-mongodb-uri --data-file=-
```

The database name defaults to `idle_dynasty` (override with the `MONGODB_DB` env var). Indexes are created on startup.

## GitHub repository variables

These are not sensitive, so they are repo *variables*, not secrets.

```bash
gh variable set GCP_PROJECT_ID     --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_REGION         --repo "$REPO" --body "$REGION"            # optional, default us-central1
gh variable set GCP_WIF_PROVIDER   --repo "$REPO" --body "$WIF_PROVIDER"
gh variable set GCP_SERVICE_ACCOUNT --repo "$REPO" --body "$DEPLOYER_EMAIL"
gh variable set CLOUD_RUN_SERVICE  --repo "$REPO" --body "$SERVICE"           # optional, default idle-dynasty
gh variable set AR_REPOSITORY      --repo "$REPO" --body "$AR_REPOSITORY"     # optional, default idle-dynasty
gh variable set USE_MONGODB        --repo "$REPO" --body "true"               # only after creating the secret
```

Then push to `main` (or run the *Deploy* workflow from the Actions tab). The service URL appears in the job summary.

## Local development

```bash
# Backend (in-memory store unless MONGODB_URI is set)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8080
pytest                      # run tests

# Frontend (separate terminal) - Vite proxies /api to http://localhost:8080
cd frontend
npm ci
npm run dev
```

Environment variables: `MONGODB_URI`, `MONGODB_DB` (default `idle_dynasty`), `STATIC_DIR` (default `./static`),
`PORT` (default 8080), `CORS_ORIGINS` (comma-separated, only needed if not using the Vite proxy).

Local container build: `docker build -t idle-dynasty . && docker run -p 8080:8080 idle-dynasty`.
