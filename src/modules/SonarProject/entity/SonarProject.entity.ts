import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
import { User } from "../../user/entity/user.entity";

@Entity({ name: "projects" })
@ObjectType()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  @Field(() => ID)
  u_id!: string;

  @Column()
  @Field()
  title!: string; // Repository name

  @Column()
  @Field()
  description!: string;

  @Column()
  @Field()
  overview!: string; // Summary of issues

  @Column()
  @Field()
  result!: string; // Passed or Failed

  @ManyToOne(() => User, { onDelete: "CASCADE" })  
  @JoinColumn({ name: "user_id", referencedColumnName: "u_id" }) // Correct mapping  
  @Field(() => User)
  user!: User;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;

  @UpdateDateColumn() 
  @Field(() => String)
  updatedAt!: Date;
}
