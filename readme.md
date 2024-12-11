

```
const router = lambdaRouter();

router.use(async (event, context, next) => {
  context.x = 1;

  next();
});

router.get("/cool", async (event, context) => {
  return {
    statusCode: 200,
    body: "Hello World",
  };
});

router.use(async (event, context, next) => {
  next();
});

router.all(async (event, context, callback) => {
  console.log(context.x);

  return {
    statusCode: 500,
    body: "Hello World",
  };
});


```