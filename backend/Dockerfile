FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download && go build -o /server ./cmd/server

FROM alpine:3.22
COPY --from=builder /server /server
EXPOSE 8080
CMD ["/server"]
