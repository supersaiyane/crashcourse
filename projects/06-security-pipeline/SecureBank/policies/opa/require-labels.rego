# OPA Gatekeeper policy: require mandatory labels on all resources
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Deployment"
  not input.request.object.metadata.labels["app.kubernetes.io/name"]
  msg := sprintf("Deployment %s must have label app.kubernetes.io/name", [input.request.object.metadata.name])
}

deny[msg] {
  input.request.kind.kind == "Deployment"
  not input.request.object.metadata.labels["environment"]
  msg := sprintf("Deployment %s must have label environment", [input.request.object.metadata.name])
}
