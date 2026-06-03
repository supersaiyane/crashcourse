# -----------------------------------------------------------------------------
# OPA Policy — Require Mandatory Tags
#
# BFSI compliance: every resource must have tags for cost allocation, audit
# trail, and environment identification. Untagged resources are invisible to
# FinOps, compliance, and incident response.
#
# Required tags:
#   - Project     (e.g. "finstack")
#   - Environment (e.g. "dev", "staging", "prod")
#   - ManagedBy   (e.g. "terraform", "terragrunt")
#   - CostCentre  (e.g. "payments-platform")
#
# Usage:
#   conftest test --policy policies/ tfplan.json
# -----------------------------------------------------------------------------

package finstack.tags

import rego.v1

# ---------------------------------------------------------------------------
# Required tags — every taggable resource must have all of these
# ---------------------------------------------------------------------------
required_tags := ["Project", "Environment", "ManagedBy", "CostCentre"]

# ---------------------------------------------------------------------------
# Resource types that support tags (AWS)
# ---------------------------------------------------------------------------
taggable_resource_types := {
    "aws_vpc",
    "aws_subnet",
    "aws_security_group",
    "aws_instance",
    "aws_eks_cluster",
    "aws_eks_node_group",
    "aws_db_instance",
    "aws_s3_bucket",
    "aws_iam_role",
    "aws_lb",
    "aws_lb_target_group",
    "aws_nat_gateway",
    "aws_eip",
    "aws_internet_gateway",
    "aws_kms_key",
    "aws_cloudwatch_log_group",
    "aws_ecs_cluster",
    "aws_ecs_service",
    "aws_lambda_function",
    "aws_sqs_queue",
    "aws_sns_topic",
}

# ---------------------------------------------------------------------------
# Deny resources missing required tags
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.change.actions[_] in {"create", "update"}
    resource.type in taggable_resource_types

    tags := object.get(resource.change.after, "tags", {})
    tags != null

    some required_tag in required_tags
    not has_tag(tags, required_tag)

    msg := sprintf(
        "DENIED: Resource '%s' (type: %s) is missing required tag '%s'. All FinStack resources must have: %s.",
        [resource.address, resource.type, required_tag, concat(", ", required_tags)]
    )
}

# Deny resources with null tags (no tags at all)
deny contains msg if {
    some resource in input.resource_changes
    resource.change.actions[_] in {"create", "update"}
    resource.type in taggable_resource_types

    tags := object.get(resource.change.after, "tags", null)
    tags == null

    msg := sprintf(
        "DENIED: Resource '%s' (type: %s) has no tags at all. Required tags: %s.",
        [resource.address, resource.type, concat(", ", required_tags)]
    )
}

# ---------------------------------------------------------------------------
# Deny empty tag values
# ---------------------------------------------------------------------------
deny contains msg if {
    some resource in input.resource_changes
    resource.change.actions[_] in {"create", "update"}
    resource.type in taggable_resource_types

    tags := object.get(resource.change.after, "tags", {})
    tags != null

    some required_tag in required_tags
    has_tag(tags, required_tag)
    trim_space(tags[required_tag]) == ""

    msg := sprintf(
        "DENIED: Resource '%s' has tag '%s' but its value is empty. Tags must have meaningful values.",
        [resource.address, required_tag]
    )
}

# ---------------------------------------------------------------------------
# Helper: check if a tag key exists
# ---------------------------------------------------------------------------
has_tag(tags, key) if {
    _ = tags[key]
}
