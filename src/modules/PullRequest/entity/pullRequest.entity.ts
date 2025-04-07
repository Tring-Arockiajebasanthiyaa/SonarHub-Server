import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
  } from "typeorm";
  import { ObjectType, Field } from "type-graphql";
  import { Repo } from "../../GitHubRepository/entity/Repo.entity";
  import { User } from "../../user/entity/user.entity";
  
  @ObjectType()
  @Entity("pull_requests")
  export class PullRequest {
    @Field()
    @PrimaryGeneratedColumn()
    u_id!: string;
  
    @Field()
    @Column({ unique: true })
    prId!: number;

  
    @Field()
    @Column()
    title!: string;
  
    @Field()
    @Column()
    state!: string;
  
    @Field()
    @Column()
    branch!: string;
  
    @Field()
    @Column()
    author!: string;
  
    @Field()
    @Column()
    githubUsername!: string;
  
    @Field()
    @Column()
    createdAt!: Date;
  
    @Field({ nullable: true })
    @Column({ nullable: true })
    closedAt?: Date;
  
    @Field({ nullable: true })
    @Column({ nullable: true })
    mergedAt?: Date;
  
         
    @Field()
    @Column({ default: 0 })
    additions!: number;
    
    @Field()
    @Column({ default: 0 })
    deletions!: number;
    
    @Field()
    @Column({ default: 0 })
    changedFiles!: number;
    
    @Field({ nullable: true })
    @Column({ nullable: true, type: "text" })
    comment?: string;
    
    @ManyToOne(() => Repo, { onDelete: "CASCADE" })
    @JoinColumn({ name: "repo_id" })
    repo!: Repo;
  
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id", referencedColumnName: "u_id" })
    user!: User;
    
  }
  