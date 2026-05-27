const bcrypt = require('bcryptjs');
async function test() {
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('password123', salt);
        console.log('Hash successful:', hash);
        const match = await bcrypt.compare('password123', hash);
        console.log('Match successful:', match);
    } catch (err) {
        console.error('Bcrypt error:', err);
    }
}
test();
