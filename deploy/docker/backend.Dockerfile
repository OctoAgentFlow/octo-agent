FROM golang:1.25-alpine
WORKDIR /app
COPY backend .
RUN go mod download && go build -o server ./cmd/server
EXPOSE 8080
CMD ["./server"]
