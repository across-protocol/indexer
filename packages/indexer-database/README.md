# indexer-database

This package is intended to manage the database interactions of the indexer project.

It uses PostgreSQL as database with TypeORM.

To create a new entity, create a file 'MyEntity.entity.ts' under the /entities folder. For example:

```ts
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    firstName: string

    @Column()
    lastName: string

    @Column()
    isActive: boolean
}
```

You can read more about entities [here](https://typeorm.io/entities).

### Migrations 

#### Creating migrations
Whenever an entity is added or modified, create the related migrations by running:
```
pnpm run db:migration:generate src/migrations/<RelatedEntity>
```

A new migration file named <timestamp>-<RelatedEntity>.ts will be created under the /migrations folder

#### Running migrations
To execute migrations, run:
```
pnpm run db:migration:run
```

### Using this package
1. Add it as a dependency of other packages that need to interact with the indexer database:
```
// other package package.json
{
    // ...
    "dependencies": {
        /// ...
        "@repo/indexer-database": "workspace:*"
    }
}
```

2. On a file of your preference, import the function createDataSource and establish the connection with the DB.

3. Import the entities you will interact with and initialize its repository to be able to query the database. You can see the methods available in the repository API [here](https://typeorm.io/repository-api). You can also use TypeORM's [QueryBuilder](https://typeorm.io/select-query-builder).

Example:
```ts
import {createDataSource} from "@repo/indexer-database"
import { User } from "@repo/indexer-database/src/entities/User.entity";

const dbConfig = {
    host: env.DATABASE_HOST || "localhost",
    port: env.DATABASE_PORT || "5432",
    user: env.DATABASE_USER || "user",
    password: env.DATABASE_PASSWORD || "password",
    dbName: env.DATABASE_NAME || "database",
}
const database = await createDataSource({dbConfig}).initialize()

const userRepository = database.getRepository(User)
const users = await userRepository.find()
```
