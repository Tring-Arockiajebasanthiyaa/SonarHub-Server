import { ObjectType, Field } from "type-graphql";
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { User } from "../../user/entity/user.entity";

@ObjectType()
@Entity("repositories")
export class Repo {
  @Field()
  @PrimaryGeneratedColumn()
  id!: number;

  @Field()
  @Column()
  name!: string;

  @Field()
  @Column()
  owner!: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  language?: string;

  @Field()
  @Column({ default: 0 })
  stars!: number;

  @Field()
  @Column({ default: 0 })
  totalCommits!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: "username", referencedColumnName: "username" })
  user!: User;
}
