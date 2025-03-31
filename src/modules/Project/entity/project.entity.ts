import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { User } from "../../user/entity/user.entity";
import { SonarIssue } from "../../SonarIssues/entity/sonarIssue.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import { GraphQLJSONObject } from "graphql-type-json";

@Entity({ name: "projects" })
@ObjectType()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  @Field(() => ID)
  u_id!: string;

  @Column()
  @Field()
  title!: string;
  
  @Column({ unique: true })
  @Field()
  repoName!: string;

  @Column()
  @Field()
  description!: string;

  @Column({ type: "text", nullable: true })
  @Field({ nullable: true })
  overview?: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  result?: string;
  
  @Column({ nullable: true })
  @Field()
  githubUrl!: string;

  @Column({ default: false })
  @Field()
  isPrivate!: boolean;

  @Column({ nullable: true })
  @Field({ nullable: true })
  defaultBranch?: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  lastAnalysisDate?: Date;

  @Column()
  @Field()
  username!: string;

  @Column({ type: "timestamp", nullable: true  })
  @Field({ nullable: true })
  analysisStartTime!: Date;

  @Column({ type: "timestamp", nullable: true })
  @Field({ nullable: true })
  analysisEndTime?: Date;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  analysisDuration?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  estimatedLinesOfCode?: number;

  @Column({ type: "json", nullable: true })
  @Field(() => GraphQLJSONObject, { nullable: true })
  languageDistribution?: Record<string, number>;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "u_id" })
  @Field(() => User)
  user!: User;

  @OneToMany(() => SonarIssue, (sonarIssue) => sonarIssue.project, { cascade: true })
  @Field(() => [SonarIssue], { nullable: true })
  sonarIssues?: SonarIssue[];

  @OneToMany(() => CodeMetrics, (metrics) => metrics.project, { cascade: true, nullable: false })
  @Field(() => [CodeMetrics], { nullable: false })
  codeMetrics!: CodeMetrics[];

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;

  @UpdateDateColumn()
  @Field(() => String)
  updatedAt!: Date;
}