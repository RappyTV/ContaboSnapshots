const { default: axios } = require(`axios`);
const { CronJob } = require(`cron`);
const { v4 } = require(`uuid`);
const cfg = require(`./config.json`);

const auth = {
    access: null,
    refresh: null,
    expires: null,
    refetch: null
};

(async function() {
    await obtainToken();

    new CronJob(`0 0 * * *`, async () => {
        if(Date.now() >= auth.refetch) await obtainToken();
        else if(Date.now() >= auth.expires) await refreshToken();

        const snapshots = await listSnapshots();
        if(snapshots && snapshots.length >= cfg.maxSnapshots) {
            const snapshotToDelete = snapshots.sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate))[0];
            const deleted = await deleteSnapshot(snapshotToDelete?.snapshotId);
            if(deleted) console.log(`Deleted snapshot ${snapshotToDelete?.snapshotId}`);
        } else console.log(`There are no snapshots to delete!`);
        

        const created = await createSnapshot();
        if(created) console.log(`Created snapshot ${created?.snapshotId}`);
    }, null, true, `Europe/Berlin`, null, true);
})();

async function obtainToken() {
    try {
        const res = await axios.post(`https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token`, {
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            username: cfg.username,
            password: cfg.password,
            grant_type: `password`
        }, {
            headers: {
                'Content-Type': `application/x-www-form-urlencoded`
            }
        });

        auth.access = res.data.access_token;
        auth.refresh = res.data.refresh_token;
        auth.expires = Date.now() + (res.data.expires_in * 1000);
        auth.refetch = Date.now() + (res.data.refresh_expires_in * 1000);
    } catch(err) {
        console.log(`Failed to obtain token: ${JSON.stringify(err.response?.data)}`);
        return null;
    }
}

async function refreshToken() {
    try {
        const res = await axios.post(`https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token`, {
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            grant_type: `refresh_token`,
            refresh_token: auth.refresh
        }, {
            headers: {
                'Content-Type': `application/x-www-form-urlencoded`
            }
        });

        auth.access = res.data.access_token;
        auth.refresh = res.data.refresh_token;
        auth.expires = Date.now() + (res.data.expires_in * 1000);
        auth.refetch = Date.now() + (res.data.refresh_expires_in * 1000);
    } catch(err) {
        console.log(`Failed to refresh token: ${JSON.stringify(err.response?.data)}`);
        return null;
    }
}

async function createSnapshot() {
    try {
        const res = await axios.post(`https://api.contabo.com/v1/compute/instances/${cfg.instance}/snapshots`, {
            name: `Automatic backup - ${Date.now().toString(36)}`,
            description: `Backup created on ${new Date().toLocaleDateString()}`
        }, {
            headers: {
                "Authorization": `Bearer ${auth.access}`,
                "X-Request-ID": v4()
            },
        });

        return res.data.data?.[0];
    } catch(err) {
        console.log(`Failed to create snapshot: ${JSON.stringify(err.response?.data)}`);
        return null;
    }
}

/**
 * 
 * @param {string} id 
 * @returns {Promise<string|null>} 
 */

async function deleteSnapshot(id) {
    if(!id) {
        console.log(`Invalid snapshot id: ${id}`);
        return null;
    }
    try {
        await axios.delete(`https://api.contabo.com/v1/compute/instances/${cfg.instance}/snapshots/${id}`, {
            headers: {
                "Authorization": `Bearer ${auth.access}`,
                "X-Request-ID": v4()
            }
        });

        return id;
    } catch(err) {
        console.log(`Failed to delete snapshot: ${JSON.stringify(err.response?.data)}`);
        return null;
    }
}

async function listSnapshots() {
    try {
        const res = await axios.get(`https://api.contabo.com/v1/compute/instances/${cfg.instance}/snapshots`, {
            headers: {
                "Authorization": `Bearer ${auth.access}`,
                "X-Request-ID": v4()
            }
        });

        return res.data.data;
    } catch(err) {
        console.log(`Failed to list snapshots: ${JSON.stringify(err.response?.data)}`);
        return null;
    }
}