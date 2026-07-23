# Package Access

Package: `@ramideltoro/nutsnews-worker-contracts`

Consumers must install exact immutable versions from GitHub Packages:

```sh
npm install @ramideltoro/nutsnews-worker-contracts@<exact-version>
```

CI consumers use the owner-scoped npm registry and a short-lived `GITHUB_TOKEN`:

```ini
@ramideltoro:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Source checkout and long-lived package tokens are not part of the supported access path.
