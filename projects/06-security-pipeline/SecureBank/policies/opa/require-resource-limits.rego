# OPA Gatekeeper policy: require resource limits on all containers
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Deployment"
  container := input.request.object.spec.template.spec.containers[_]
  not container.resources.limits
  msg := sprintf("Container %s in Deployment %s must have resource limits", [container.name, input.request.object.metadata.name])
}
