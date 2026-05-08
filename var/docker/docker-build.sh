#!/bin/bash

set -o xtrace

docker rmi localhost/snaps || true
docker build --target dist -t localhost/snaps -f Dockerfile.dev .
docker build --target devcontainer -t localhost/snaps-devcontainer -f Dockerfile.dev .
