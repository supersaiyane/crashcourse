# -----------------------------------------------------------------------------
# OPA Policy — Restrict EC2 Instance Types
#
# BFSI cost control: only approved instance types may be provisioned.
# This prevents accidental deployment of expensive GPU or metal instances
# that blow the budget. Approved types are right-sized for the FinStack
# payment workload (API servers, monitoring, bastion hosts).
#
# Usage:
#   conftest test --policy policies/ tfplan.json
# -----------------------------------------------------------------------------

package finstack.instances

import rego.v1

# ---------------------------------------------------------------------------
# Approved instance types — add new types here as workloads evolve
# ---------------------------------------------------------------------------
approved_instance_types := {
    # Dev / test — small and cost-conscious
    "t3.micro",
    "t3.small",
    "t3.medium",

    # Staging — closer to production sizing
    "t3.large",
    "t3.xlarge",

    # Production — general purpose for the payment API
    "m5.large",
    "m5.xlarge",
    "m5.2xlarge",

    # Production — memory-optimised for database-heavy workloads
    "r5.large",
    "r5.xlarge",

    # Burstable — for non-critical background jobs
    "t3a.micro",
    "t3a.small",
    "t3a.medium",
}

# ---------------------------------------------------------------------------
# Deny EC2 instances with unapproved instance types
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_instance"
    resource.change.actions[_] in {"create", "update"}

    instance_type := resource.change.after.instance_type
    not instance_type in approved_instance_types

    msg := sprintf(
        "DENIED: EC2 instance '%s' uses instance type '%s' which is not in the approved list. Approved types: %s. Request an exception via the cloud governance team if you need a different type.",
        [resource.address, instance_type, concat(", ", approved_instance_types)]
    )
}

# ---------------------------------------------------------------------------
# Deny EKS node groups with unapproved instance types
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_eks_node_group"
    resource.change.actions[_] in {"create", "update"}

    some instance_type in resource.change.after.instance_types
    not instance_type in approved_instance_types

    msg := sprintf(
        "DENIED: EKS node group '%s' includes instance type '%s' which is not approved. Approved types: %s.",
        [resource.address, instance_type, concat(", ", approved_instance_types)]
    )
}

# ---------------------------------------------------------------------------
# Deny RDS instances with unapproved instance classes
# ---------------------------------------------------------------------------
approved_db_instance_classes := {
    # Dev
    "db.t3.micro",
    "db.t3.small",
    "db.t3.medium",

    # Staging / Production
    "db.r5.large",
    "db.r5.xlarge",
    "db.r6g.large",
    "db.r6g.xlarge",
}

deny contains msg if {
    some resource in input.resource_changes
    resource.type == "aws_db_instance"
    resource.change.actions[_] in {"create", "update"}

    db_class := resource.change.after.instance_class
    not db_class in approved_db_instance_classes

    msg := sprintf(
        "DENIED: RDS instance '%s' uses instance class '%s' which is not approved. Approved classes: %s.",
        [resource.address, db_class, concat(", ", approved_db_instance_classes)]
    )
}
