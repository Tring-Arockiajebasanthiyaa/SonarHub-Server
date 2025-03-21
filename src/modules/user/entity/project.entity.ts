import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";
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

  @Column()
  @Field()
  owner!: string;

  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}