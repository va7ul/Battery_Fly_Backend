const mongoose = require('mongoose');
const app = require('./app');
const { startScheduler } = require('./jobs/scheduler');

const { DB_HOST, PORT = 3000 } = process.env;

mongoose
  .connect(DB_HOST)
  .then(() => {
    app.listen(PORT, () => {
      console.info('Database connection successful');
    });

    // ⚠️ Після підключення до бази, і саме тут, а не в app.js: app.js
    // імпортують тести й інструменти, що піднімають застосунок без мережі, —
    // крон стартував би в кожному такому прогоні.
    //
    // ⚠️ Прохід іде всередині веб-процесу, тож на кількох інстансах їх буде
    // кілька. Від подвійної роботи захищає замок у базі (helpers/cronLock.js).
    startScheduler();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
