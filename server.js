require("dotenv").config();
const express = require("express");
const path = require("path");
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");

const app = express();
const cache = new NodeCache({stdTTL: 300});
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later" }
});

app.use(limiter);
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/currency", async (req, res) => {
    const { from, to, amount } = req.query;
    
    if (!from || !to) {
        return res.status(400).json({ error: "From and To currency codes required" });
    }

    const numAmount = parseFloat(amount) || 1;
    const cacheKey = `currency_${from}_${to}`;

    try {
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({
                from: from,
                to: to,
                amount: numAmount,
                result: numAmount * cached,
                rate: cached,
                date: new Date().toISOString().split('T')[0],
                cached: true
            });
        }

        const response = await fetch(
            `https://api.frankfurter.app/latest?from=${from}&to=${to}`
        );
        const data = await response.json();

        if (!data.rates || !data.rates[to]) {
            return res.status(404).json({ error: "Currency not found" });
        }

        const rate = data.rates[to];
        cache.set(cacheKey, rate);
        
        res.json({
            from: from,
            to: to,
            amount: numAmount,
            result: numAmount * rate,
            rate: rate,
            date: data.date,
            cached: false
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch currency data" });
    }
});

app.get("/api/weather", async (req, res) => {
    const { city } = req.query;
    
    if (!city) {
        return res.status(400).json({ error: "City name required" });
    }

    const cacheKey = `weather_${city.toLowerCase()}`;

    try {
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json({...cached, cached: true});
        }

        const response = await fetch(
            `https://wttr.in/${city}?format=j1&m`
        );
        
        const data = await response.json();
        
        if (!data.current_condition || data.current_condition.length === 0) {
            return res.status(404).json({ error: "City not found" });
        }

        const current = data.current_condition[0];
        const areaData = data.nearest_area && data.nearest_area[0];
        const weatherData = {
            city: areaData ? areaData.areaName[0].value : city,
            country: areaData ? areaData.country[0].value : "",
            temp: parseInt(current.temp_C),
            feels_like: parseInt(current.FeelsLikeC),
            humidity: parseInt(current.humidity),
            wind: parseFloat(current.windspeedKmph),
            description: current.weatherDesc[0].value.toLowerCase(),
            icon: ""
        };

        cache.set(cacheKey, weatherData);
        res.json({...weatherData, cached: false});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch weather data" });
    }
});

app.get("/api/exchange", async (req, res) => {
    try {
        const response = await fetch("https://api.frankfurter.app/latest?from=USD");
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
});

app.listen(3000, () => {
    console.log("Dashboard server running on http://localhost:3000");
});
