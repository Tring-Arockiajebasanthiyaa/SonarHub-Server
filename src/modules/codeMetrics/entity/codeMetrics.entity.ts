import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { Project } from "../../Project/entity/project.entity";

@Entity({ name: "code_metrics" })
@ObjectType()
export class CodeMetrics {
  @PrimaryGeneratedColumn("uuid")
  @Field(() => ID)
  u_id!: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  repoName?: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  username?: string;

  @ManyToOne(() => Project, (project) => project.codeMetrics, { onDelete: "CASCADE" })
  @Field(() => Project)
  project!: Project;

  @Column({ nullable: true })
  @Field({ nullable: true })
  branch?: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  language?: string;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  linesOfCode?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  filesCount?: number;

  @Column({ type: "float", nullable: true })
  @Field({ nullable: true })
  coverage?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  duplicatedLines?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  violations?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  complexity?: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  technicalDebt?: number;

  @Column({ type: 'float', nullable: true })
  @Field({ nullable: true })
  reliabilityRating?: number;

  @Column({ type: 'float', nullable: true })
  @Field({ nullable: true })
  securityRating?: number;

  @Column({ type: 'int', nullable: true })
  @Field({ nullable: true })
  bugs?: number;

  @Column({ type: 'int', nullable: true })
  @Field({ nullable: true })
  vulnerabilities?: number;

  @Column({ type: 'int', nullable: true })
  @Field({ nullable: true })
  codeSmells?: number;

  @Column({ type: 'float', nullable: true })
  @Field({ nullable: true })
  debtRatio?: number;

  @Column({ type: 'varchar', nullable: true })
  @Field({ nullable: true })
  qualityGateStatus?: string;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}
