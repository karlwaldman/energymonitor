.PHONY: dev test build deploy

dev:
	npm run dev:energy

test:
	npx playwright test

build:
	npm run build:energy

deploy:
	vercel --prod
