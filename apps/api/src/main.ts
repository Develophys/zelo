import "./shared/config/load-env.ts";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";
import { configureApp } from "./shared/http/configure-app.ts";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Zelo API listening on port ${port}`);
}

bootstrap();
