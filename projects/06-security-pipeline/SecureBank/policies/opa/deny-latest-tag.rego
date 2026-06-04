# OPA Gatekeeper policy: deny :latest image tags
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Deployment"
  container := input.request.object.spec.template.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("Container %s uses :latest tag — pin to a specific version", [container.name])
}
