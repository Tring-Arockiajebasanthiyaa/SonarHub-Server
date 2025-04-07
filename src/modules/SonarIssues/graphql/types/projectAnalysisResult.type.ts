import { ObjectType, Field } from "type-graphql";
import { Project } from "../../../Project/entity/project.entity";
import { Branch } from "../../../branch/entity/branch.entity";
import { CodeMetrics } from "../../../codeMetrics/entity/codeMetrics.entity";
import { SonarIssue } from "../../entity/sonarIssue.entity";
import { LocReport } from "./LocReport";

@ObjectType()
export class ProjectAnalysisResult {
  @Field(() => Project)
    project!: Project;

  @Field(() => [Branch])
    branches: Branch[]=[];

  @Field(() => [CodeMetrics])
    codeMetrics: CodeMetrics[]=[];

  @Field(() => [SonarIssue])
    sonarIssues: SonarIssue[]=[];

    @Field(() => LocReport, { nullable: true })
    locReport?: LocReport;
}