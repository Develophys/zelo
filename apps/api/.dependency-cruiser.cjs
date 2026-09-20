const base = require("@zelo/config/dependency-cruiser.base.cjs");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...base.forbidden,
    {
      name: "application-no-infrastructure-imports",
      comment: "application/ (ports + use-cases) must depend only on ports, never on concrete infrastructure — that's the Dependency Inversion boundary (spec Section C).",
      severity: "error",
      from: { path: "^src/modules/[^/]+/application" },
      to: { path: "^src/modules/[^/]+/infrastructure" },
    },
    {
      name: "application-no-prisma-imports",
      comment: "application/ must never import the Prisma client directly — only through a port implemented in infrastructure/. This project generates its client to apps/api/generated/prisma (schema.prisma's `generator client { output }`), which is how every repository actually reaches it; node_modules/@prisma/client is covered too so installing and importing the package cannot bypass the boundary either.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/application" },
      to: { path: "^generated/prisma|node_modules/@prisma/client" },
    },
  ],
  options: {
    ...base.options,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
