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
import { SonarIssue } from "../../SonarIssues/entity/SonarIssue.entity";

@Entity({ name: "projects" })
@ObjectType()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  @Field(() => ID)
  u_id!: string;

  @Column()
  @Field()
  title!: string;

  @Column()
  @Field()
  description!: string;

  @Column()
  @Field()
  overview!: string;

  @Column()
  @Field()
  result!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "u_id" })
  @Field(() => User)
  user!: User;

  @OneToMany(() => SonarIssue, (sonarIssue) => sonarIssue.project, { cascade: true })
  @Field(() => [SonarIssue], { nullable: true })
  sonarIssues?: SonarIssue[];

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;

  @UpdateDateColumn()
  @Field(() => String)
  updatedAt!: Date;
}
