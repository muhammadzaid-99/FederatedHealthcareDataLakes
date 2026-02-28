BINARY_NAME=etl-server

.PHONY: build run clean

build:
	go build -o $(BINARY_NAME) ./cmd/server

run:
	go run ./cmd/server

clean:
	rm -f $(BINARY_NAME)
