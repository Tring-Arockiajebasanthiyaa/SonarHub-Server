import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { ObjectType, Field } from "type-graphql";

@Entity({ name: "projects" })
@ObjectType()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  @Field()
  id!: string;

  @Column()
  @Field()
  title!: string;

  @Column()
  @Field()
  description!: string;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}

@Entity({ name: "sonar_issues" })
@ObjectType()
export class SonarIssue {
  @PrimaryGeneratedColumn("uuid")
  @Field()
  id!: string;

  @ManyToOne(() => Project, (project) => project.id, { onDelete: "CASCADE" })
  @Field(() => Project)
  project!: Project;

  @Column()
  @Field()
  issueType!: string; // BUG, CODE_SMELL, VULNERABILITY

  @Column()
  @Field()
  severity!: string; // MAJOR, CRITICAL, BLOCKER, etc.

  @Column()
  @Field()
  message!: string;

  @Column()
  @Field()
  rule!: string;

  @Column()
  @Field()
  component!: string;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}
