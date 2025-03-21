import { DataSource, DataSourceOptions } from "typeorm";
import dotenv from "dotenv";
import { User } from "../modules/user/entity/user.entity";
import { Project } from "../modules/user/entity/project.entity";

dotenv.config();

export const dbdataSource: DataSourceOptions = {
  type: "postgres",
  database: process.env.DB_NAME || "SonarHub",
  entities: [User, Project],
  migrations: ["src/database/migrations/*.{js,ts}"],
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "1234",
  synchronize: true,
  logging: true,
};

const dataSource = new DataSource(dbdataSource);
export default dataSource;
