import { DataSource, DataSourceOptions } from "typeorm";
import dotenv from "dotenv";
import { User } from "../modules/user/entity/user.entity";
import { Project } from "../modules/Project/entity/project.entity";
import {UserActivity} from "../modules/UserActivity/entity/UserActivity.entity";
import {SonarIssue} from"../modules/SonarIssues/entity/SonarIssue.entity";
import { Repo } from "../modules/GitHubRepository/entity/Repo.entity";
dotenv.config();

export const dbdataSource: DataSourceOptions = {
  type: "postgres",
  database: process.env.DB_NAME || "SonarHub",
  entities: [User, Project,UserActivity,SonarIssue,Repo],
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
