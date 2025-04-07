import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
} from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { Project } from "../../Project/entity/project.entity";

@Entity({ name: "sonar_issues" })
@ObjectType()
export class SonarIssue {
    @PrimaryGeneratedColumn("uuid")
    @Field(() => ID)
    u_id!: string;

    @Column() 
    @Field()
    key!: string; 

    @ManyToOne(() => Project, (project) => project.sonarIssues, { 
      onDelete: "CASCADE",
      eager: true 
    })
    @Field(() => Project)
    project!: Project;

    @Column()
    @Field()
    type!: string; 

    @Column()
    @Field()
    severity!: string;

    @Column()
    @Field()
    message!: string;

    @Column()
    @Field()
    rule!: string;

    @Column()
    @Field()
    component!: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    projectVersion?: string; 

    @Column({ nullable: true })
    @Field({ nullable: true })
    line?: number;

    @Column({ nullable: true })
    @Field({ nullable: true })
    effort?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    debt?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    author?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    status?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    resolution?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    hash?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    textRange?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    flows?: string;

    @Column({ nullable: true })
    @Field({ nullable: true })
    tags?: string; 

    @CreateDateColumn()
    @Field(() => String)
    createdAt!: Date;
}