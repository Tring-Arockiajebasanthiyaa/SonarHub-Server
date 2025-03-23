import { Field, ObjectType } from "type-graphql";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../user/entity/user.entity";

@ObjectType()
@Entity({ name: "user_activity_logs" })
export class UserActivity {
  @Field()
  @PrimaryGeneratedColumn()
  u_id!: string;

  @Field(() => User)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: "user_id" })  
  user!: User;

  @Field()
  @Column()
  githubUsername!: string;

  @Field(() => [String])
  @Column("simple-array", { default: "" }) 
  commitHistory!: string[];

  @Field(() => [String])
  @Column("simple-array", { default: "" })
  repoCommits!: string[];

  @Field()
  @Column({ type: "int", default: 0 })
  totalRepositories!: number;  

  @Field()
  @Column({ type: "int", default: 0 })
  totalCommits!: number; 


  @Field()
  @Column({ type: "int", default: 0 })
  totalForks!: number;  

  @Field()
  @Column({ type: "int", default: 0 })
  totalStars!: number;  

  @Field()
  @Column({ type: "int", default: 0 })
  publicRepoCount!: number;  

  @Field()
  @Column({ type: "int", default: 0 })
  privateRepoCount!: number;  

  @Field(() => [String])
 @Column({ type: "json", default: "[]" })
  languagesUsed!: string[];


  @Field()
  @Column({ default: "" })
  topContributedRepo!: string; 

  @Field()
  @Column({ type: "timestamp", nullable: true })
  earliestRepoCreatedAt!: Date;  

  @Field()
  @Column({ type: "timestamp", nullable: true })
  mostRecentlyUpdatedRepo!: Date;  

  @Field()
  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  lastActive!: Date;

  @Field()
  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Field()
  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Field()  
  @Column({ default: "No issues" })
  sonarIssues!: string;


  @Field()
  @Column({ default: "0%" })
  issuePercentage!: string;
  
  @Field()
  @Column({ default: "Low" })
  dangerLevel!: string;
  

}

