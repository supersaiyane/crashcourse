# Exercise 1: Deploy AWS VPC with Terraform

**Goal:** Create a production-grade VPC with 2 public and 2 private subnets across 2 availability zones, and verify the routing is correct.

## Step 1: Initialise Terraform

```bash
cd projects/07-multi-cloud-app/terraform/aws
terraform init                                   # download providers and modules
```

Expected output:
- `Initializing modules...` and `Initializing provider plugins...`
- `Terraform has been successfully initialized!`

## Step 2: Plan the VPC deployment

```bash
terraform plan -out=vpc.tfplan                   # preview resources to be created
```

Expected output:
- `Plan: 23 to add, 0 to change, 0 to destroy.`
- Resources include: VPC, 4 subnets, route tables, NAT Gateway, Internet Gateway, EIPs

## Step 3: Apply the plan

```bash
terraform apply vpc.tfplan                       # create the VPC — takes ~2 minutes
```

Expected output:
- `Apply complete! Resources: 23 added, 0 changed, 0 destroyed.`
- Outputs showing `vpc_id`, subnet IDs

## Step 4: Verify subnets

```bash
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --query "Subnets[].{CIDR:CidrBlock,AZ:AvailabilityZone,Public:MapPublicIpOnLaunch}" \
  --output table
```

Expected output:
- 4 rows: 2 with `Public=True` (10.0.1.0/24, 10.0.3.0/24) and 2 with `Public=False` (10.0.2.0/24, 10.0.4.0/24)

## Step 5: Verify route tables

```bash
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,GW:GatewayId,NAT:NatGatewayId}" \
  --output table
```

Expected output:
- Public subnet routes show `igw-xxxx` for `0.0.0.0/0`
- Private subnet routes show `nat-xxxx` for `0.0.0.0/0`

## Verify

```bash
terraform output vpc_id                          # should print a VPC ID like vpc-0abc123def
aws ec2 describe-vpcs --vpc-ids $(terraform output -raw vpc_id) \
  --query "Vpcs[0].State" --output text
```

You should see: `available` — the VPC is ready. Proceed to Exercise 2 to deploy EKS into this VPC.
