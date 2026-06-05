# Exercise 4: Configure Nginx Ingress with TLS

**Goal:** Install the Nginx ingress controller and create an Ingress resource with TLS termination for CloudPlatform.

## Step 1: Install Nginx ingress controller via Helm

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2          # 2 replicas for HA
```

## Step 2: Verify the controller is running

```bash
kubectl get pods -n ingress-nginx
# NAME                                       READY   STATUS    RESTARTS   AGE
# ingress-nginx-controller-...               1/1     Running   0          60s
# ingress-nginx-controller-...               1/1     Running   0          60s
```

## Step 3: Check the external IP

```bash
kubectl get svc -n ingress-nginx
# NAME                       TYPE           EXTERNAL-IP     PORT(S)
# ingress-nginx-controller   LoadBalancer   34.xx.xx.xx     80:30080,443:30443
```

Note the EXTERNAL-IP — this is what your DNS record should point to.

## Step 4: Create the Ingress resource

```bash
cat > k8s/base/ingress.yaml << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cloudplatform-ingress
  namespace: cloudplatform
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - cloudplatform.example.com
      secretName: cloudplatform-tls
  rules:
    - host: cloudplatform.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: analytics-api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
EOF
```

## Step 5: Apply and verify

```bash
kubectl apply -f k8s/base/ingress.yaml -n cloudplatform

kubectl get ingress -n cloudplatform
# NAME                    CLASS   HOSTS                        ADDRESS         PORTS     AGE
# cloudplatform-ingress   nginx   cloudplatform.example.com    34.xx.xx.xx     80, 443   30s
```

## Step 6: Test routing (after DNS configuration)

```bash
curl -k https://cloudplatform.example.com/api/healthz    # API route
# {"status": "healthy"}

curl -k https://cloudplatform.example.com/                # frontend route
# <!doctype html>... (frontend)
```

## Verify

```bash
kubectl get ingress -n cloudplatform -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}'
```

You should see: a valid external IP address. The `/api` path routes to analytics-api and `/` routes to frontend. TLS is configured via the `tls` block in the Ingress spec.
