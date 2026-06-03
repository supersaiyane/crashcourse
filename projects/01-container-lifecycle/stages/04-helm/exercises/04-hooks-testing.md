# Exercise 4: Helm Hooks & Testing

**Goal:** Add lifecycle hooks and test resources to the Cutlink chart.

## Step 1 — Create pre-install migration job

Create `templates/hooks/pre-install-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "cutlink.fullname" . }}-db-migrate
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: "{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}"
          command:
            - python
            - -c
            - |
              import psycopg2
              conn = psycopg2.connect(
                host="{{ .Release.Name }}-postgresql",
                dbname="{{ .Values.postgresql.auth.database }}",
                user="{{ .Values.postgresql.auth.username }}",
                password="{{ .Values.postgresql.auth.password }}"
              )
              cur = conn.cursor()
              cur.execute('''
                CREATE TABLE IF NOT EXISTS urls (
                  id SERIAL PRIMARY KEY,
                  short_code VARCHAR(10) UNIQUE NOT NULL,
                  original_url TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT NOW(),
                  clicks INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS clicks (
                  id SERIAL PRIMARY KEY,
                  url_id INTEGER REFERENCES urls(id),
                  clicked_at TIMESTAMP DEFAULT NOW(),
                  referer TEXT,
                  user_agent TEXT
                );
              ''')
              conn.commit()
              cur.close()
              conn.close()
              print("Migration completed successfully")
      restartPolicy: Never
```

## Step 2 — Create post-install smoke test job

Create `templates/hooks/post-upgrade-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "cutlink.fullname" . }}-smoke-test
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "5"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      containers:
        - name: smoke-test
          image: curlimages/curl:latest
          command:
            - sh
            - -c
            - |
              curl -f http://{{ include "cutlink.fullname" . }}-backend:{{ .Values.backend.service.port }}/health || exit 1
              echo "Smoke test passed"
      restartPolicy: Never
```

## Step 3 — Create a helm test pod

Create `templates/tests/test-connection.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "cutlink.fullname" . }}-test"
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: test
      image: curlimages/curl:latest
      command:
        - sh
        - -c
        - |
          echo "Test 1: Backend health"
          curl -f http://{{ include "cutlink.fullname" . }}-backend:{{ .Values.backend.service.port }}/health || exit 1
          echo "Test 2: Frontend available"
          curl -f http://{{ include "cutlink.fullname" . }}-frontend:{{ .Values.frontend.service.port }}/ || exit 1
          echo "Test 3: URL shortening"
          curl -s -o /dev/null -w "%{http_code}" -X POST http://{{ include "cutlink.fullname" . }}-backend:{{ .Values.backend.service.port }}/shorten \
            -H "Content-Type: application/json" \
            -d '{"url":"https://example.com"}' | grep -q 201 && echo "PASS" || exit 1
          echo "All tests passed"
      restartPolicy: Never
```

## Step 4 — Install and test

```bash
helm install cutlink-test sample-app/helm/cutlink/ --namespace cutlink-test --create-namespace
kubectl wait --for=condition=complete job --all -n cutlink-test --timeout=60s
helm test cutlink-test -n cutlink-test
```

## Step 5 — Debug a failing test

```bash
kubectl logs job/cutlink-test-db-migrate -n cutlink-test
helm delete cutlink-test -n cutlink-test
helm install cutlink-test sample-app/helm/cutlink/ --namespace cutlink-test
```

## Hook Execution Order

```
pre-install hooks (weight -5)
  └── db-migrate job
regular resources (weight 0)
  └── deployments, services, configmaps, etc.
post-install hooks (weight 5)
  └── smoke-test job
release created
helm test
  └── test pods run
```
