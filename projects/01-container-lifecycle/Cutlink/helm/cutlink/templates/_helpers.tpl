# vim: set ft=go:
apiVersion: v2
{{- /*
  Chart-wide named templates shared by all templates.
  Each block returns a stable string to avoid repetition and
  guarantee consistent label selectors.
*/}}

{{- /*
name: Truncated chart name.
Usage: {{ include "cutlink.name" . }}
*/}}
{{- define "cutlink.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- /*
fullname: Combined release + chart name, truncated to 63 chars (DNS limit).
Usage: {{ include "cutlink.fullname" . }}
*/}}
{{- define "cutlink.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- /*
chart: Chart name + version metadata.
*/}}
{{- define "cutlink.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- /*
labels: Standard Kubernetes recommended labels.
Used by every workload, service, and pod template.
*/}}
{{- define "cutlink.labels" -}}
helm.sh/chart: {{ include "cutlink.chart" . }}
{{ include "cutlink.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- /*
selectorLabels: Labels used in .spec.selector.matchLabels.
These must never change after creation.
*/}}
{{- define "cutlink.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cutlink.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- /*
namespace: Target namespace for all resources.
In Helm 3 the release namespace is always known,
but we allow explicit override.
*/}}
{{- define "cutlink.namespace" -}}
{{- default .Release.Namespace .Values.namespace.name }}
{{- end }}

{{- /*
serviceAccountName: Resolves to the configured service account name,
or "default" when none is set.
*/}}
{{- define "cutlink.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cutlink.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- /*
db.host: Resolves database host string (subchart service or custom).
*/}}
{{- define "cutlink.db.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql.%s.svc.cluster.local" .Release.Name .Release.Namespace }}
{{- else }}
{{- .Values.externalServices.postgresql.host }}
{{- end }}
{{- end }}

{{- /*
redis.host: Resolves redis host string.
*/}}
{{- define "cutlink.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master.%s.svc.cluster.local" .Release.Name .Release.Namespace }}
{{- else }}
{{- .Values.externalServices.redis.host }}
{{- end }}
{{- end }}

{{- /*
ingress.host: Returns the first host from the first ingress rule.
*/}}
{{- define "cutlink.ingress.host" -}}
{{- $host := "" }}
{{- range .Values.ingress.rules }}
{{- if .host }}
{{- $host = .host }}
{{- end }}
{{- end }}
{{- $host }}
{{- end }}
