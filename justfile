set shell := ["bash", "-lc"]

alias ci := ["contracts", "backend", "frontend"]

default:
  @just --list

install:
  pnpm install

build:
  pnpm -r run build

dev:
  pnpm dev

test-contracts:
  pnpm --filter contracts test

test-backend:
  pnpm --filter backend test

test-frontend:
  pnpm --filter frontend test

deploy-testnet:
  pnpm run deploy:testnet

verify-testnet:
  pnpm run verify:testnet

postdeploy:
  pnpm run postdeploy
