# Exercise 2: Launch EKS Cluster

**Goal:** Deploy an EKS cluster into the VPC from Exercise 1, configure kubectl access, and verify the cluster is operational by running a test pod.

## Step 1: Deploy EKS with Terraform

```bash
cd projects/07-multi-cloud-app/terraform/aws
terraform apply -auto-approve                    # deploys EKS — takes 10-15 minutes
```

Expected output:
- `module.eks.aws_eks_cluster.this[0]: Creating...`
- After 10-15 minutes: `Apply complete! Resources: 12 added.`

## Step 2: Configure kubectl

```bash
aws eks update-kubeconfig \
  --name cloudplatform-eks \
  --region us-east-1                             # adds cluster to ~/.kube/config
```

Expected output:
- `Added new context arn:aws:eks:us-east-1:...:cluster/cloudplatform-eks`

## Step 3: Verify nodes are ready

```bash
kubectl get nodes                                # expect 2 nodes in Ready state
```

Expected output:
- 2 nodes with `STATUS: Ready` and `VERSION: v1.29.x`
- Node names start with `ip-10-0-` (private subnet IPs)

## Step 4: Run a test pod

```bash
kubectl run cloudplatform-test \
  --image=nginx:1.25-alpine \
  --port=80                                      # tests image pull via NAT Gateway
kubectl get pods -w                              # watch until Running
```

Expected output:
- Pod transitions from `Pending` to `ContainerCreating` to `Running`

## Step 5: Check logs and clean up

```bash
kubectl logs cloudplatform-test                  # nginx startup log
kubectl delete pod cloudplatform-test            # remove test pod
```

Expected output:
- Nginx log lines showing successful startup
- `pod "cloudplatform-test" deleted`

## Verify

```bash
kubectl get nodes -o wide                        # nodes show INTERNAL-IP in 10.0.2.x or 10.0.4.x
kubectl get ns                                   # default, kube-system, kube-public namespaces exist
```

You should see: 2 nodes in `Ready` state with private IPs, confirming they run in private subnets. Proceed to Exercise 3 for RDS and S3.
