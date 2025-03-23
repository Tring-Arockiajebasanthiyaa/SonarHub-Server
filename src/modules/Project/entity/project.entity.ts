import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm"; 
import { ObjectType, Field } from "type-graphql";

@Entity({ name: "projects" })
@ObjectType()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  @Field()
  u_id!: string;

  @Column()
  @Field()
  title!: string;

  @Column()
  @Field()
  description!: string;

  @Column("text")
  @Field()
  issues!: string; 

  @Column("text")
  @Field()
  codeSmells!: string; 
  @Column("text")
  @Field()
  suggestions!: string; 
  
  @CreateDateColumn()
  @Field(() => String)
  createdAt!: Date;
}
