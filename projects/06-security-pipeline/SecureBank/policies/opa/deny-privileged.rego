# OPA Gatekeeper policy: deny privileged containers
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Deployment"
  container := input.request.object.spec.template.spec.containers[_]
  container.securityContext.privileged == true
  msg := sprintf("Privileged container %s not allowed in Deployment %s", [container.name, input.request.object.metadata.name])
}
