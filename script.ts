import { prisma } from "./lib/prisma";

async function main() {
  // Create a new user with a post
  const post = await prisma.post.create({
    data: {
      title: "Hello world",
      content: "Fuck the world",
      published: true,
      authorId: 123
    }
  });
  console.log("Created user:", post);

}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });