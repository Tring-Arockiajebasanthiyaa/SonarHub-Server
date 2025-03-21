import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { ObjectType, Field } from "type-graphql";

@Entity({ name: "users" })
@ObjectType()
export class User {
  @PrimaryGeneratedColumn("uuid")
  @Field()
  u_id!: string;

  @Column()
  @Field()
  name!: string;

  @Column({ unique: true })
  @Field()
  email!: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  @Field({ nullable: true })
  password?: string;

  @Column({ unique: true })
  @Field()
  username!: string; // Ensure this is NOT NULL

  @Column({ unique: true, nullable: true })
  @Field({ nullable: true })
  githubId?: string;
}