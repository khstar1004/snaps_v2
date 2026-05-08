#!/usr/bin/env bash

docker kill snaps || true
docker rm snaps || true
docker create --name snaps -p 3000:3000 -p 4200:4200 localhost/snaps
