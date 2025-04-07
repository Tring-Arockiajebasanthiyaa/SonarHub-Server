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

  @ManyToOne(() => Project, (project) => project.codeMetrics, { onDelete: "CASCADE" })
  @Field(() => Project)
  project!: Project;

  @Column()
  @Field()
  branch!: string;

  @Column()
  @Field()
  language!: string;

  @Column({ type: "int" })
  @Field()
  linesOfCode!: number;

  @Column({ type: "int" })
  @Field()
  filesCount!: number;

  @Column({ type: "float" })
  @Field()
  coverage!: number;

  @Column({ type: "int" })
  @Field()
  duplicatedLines!: number;

  @Column({ type: "int" })
  @Field()
  violations!: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  complexity!: number;

  @Column({ type: "int", nullable: true })
  @Field({ nullable: true })
  technicalDebt?: number;

  @Column({ type: 'float', nullable: true })
  reliabilityRating!: number;
  
  @Column({ type: 'float', nullable: true })
  securityRating!: number;
  
  @Column({ type: 'int', nullable: true })
  bugs!: number;
  
  @Column({ type: 'int', nullable: true })
  vulnerabilities!: number;
  
  @Column({ type: 'int', nullable: true })
  codeSmells!: number;
  
  @Column({ type: 'float', nullable: true })
  debtRatio!: number;
  
  @Column({ type: 'varchar', nullable: true })
  qualityGateStatus!: string;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}