import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { User } from "../../user/entity/user.entity";
import { ObjectType, Field } from "type-graphql";
@ObjectType()
@Entity("repositories")
@Unique(["name", "owner"])
export class Repo {
  @Field()
  @PrimaryGeneratedColumn()
  id!: number;

  @Field()
  @Column()
  name!: string;

  @Field()
  @ManyToOne(() => User, (user) => user.username, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner", referencedColumnName: "u_id" })
  owner!: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  language?: string;

  @Field()
  @Column({ default: 0 })
  stars!: number;

  @Field()
  @Column({ default: 0 })
  totalCommits!: number;
}
