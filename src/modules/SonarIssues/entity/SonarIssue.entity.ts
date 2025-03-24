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

    @ManyToOne(() => Project, (project) => project.sonarIssues, { onDelete: "CASCADE" })
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
