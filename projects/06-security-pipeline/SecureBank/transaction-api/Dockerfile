# Stage 1: TEST — build, vet, test
FROM golang:1.22-alpine AS test
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go vet ./...                       # static analysis
RUN go test -v ./...                   # 7 tests must pass

# Stage 2: BUILD — compile static binary
FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /securebank .

# Stage 3: PRODUCTION — distroless, non-root, minimal
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /securebank /securebank
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/securebank"]
