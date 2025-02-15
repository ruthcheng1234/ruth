let map;
let service;
let searchBatch = 0;
let searchTimeout;
let searchCache = new Map(); // 添加緩存

function initMap() {
    const mapDiv = document.createElement('div');
    mapDiv.style.display = 'none';
    document.body.appendChild(mapDiv);
    
    map = new google.maps.Map(mapDiv, {
        center: { lat: 22.2898675, lng: 113.9412633 },
        zoom: 15
    });
    
    service = new google.maps.places.PlacesService(map);
}

function getCacheKey(lat, lng, timeLimit) {
    return `${lat},${lng},${timeLimit}`;
}

function searchPlaces() {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    const coordinatesInput = document.getElementById('coordinates').value;
    const timeLimit = parseInt(document.getElementById('timeRange').value);
    const [lat, lng] = coordinatesInput.split(',').map(coord => parseFloat(coord.trim()));
    
    if (isNaN(lat) || isNaN(lng)) {
        alert('請輸入有效的經緯度！');
        return;
    }

    // 檢查緩存
    const cacheKey = getCacheKey(lat, lng, timeLimit);
    if (searchCache.has(cacheKey)) {
        console.log('使用緩存結果');
        const cachedResults = searchCache.get(cacheKey);
        displayResults(cachedResults);
        return;
    }

    document.getElementById('loading').style.display = 'block';
    document.getElementById('resultsBody').innerHTML = '';
    document.getElementById('resultsTable').style.display = 'none';
    document.getElementById('exportButton').style.display = 'none';
    document.getElementById('progress').textContent = '搜索中...';

    searchBatch++;
    const currentBatch = searchBatch;

    // 設置30秒超時
    searchTimeout = setTimeout(() => {
        if (document.getElementById('loading').style.display !== 'none') {
            document.getElementById('loading').style.display = 'none';
            alert('搜索超時，請重試');
        }
    }, 30000);

    const location = new google.maps.LatLng(lat, lng);
    
    // 使用中文類別並擴充關鍵字
    const searchTypes = [
        { type: 'housing_estate', keyword: '屋苑|住宅|大廈|樓|苑', label: '住宅' },
        { type: 'shopping_mall', keyword: '商場|廣場|商業|中心|plaza|mall', label: '商場' },
        { type: 'lodging', keyword: '酒店|賓館|旅館|hotel', label: '酒店' },
        { type: 'parking', keyword: '停車場|泊車|parking', label: '停車場' },
        { type: 'government', keyword: '政府|學校|醫院|警署|消防局', label: '政府設施' }
    ];

    let allResults = [];
    let completedSearches = 0;

    searchTypes.forEach(searchType => {
        const request = {
            location: location,
            radius: '3000',
            type: searchType.type,
            keyword: searchType.keyword
        };

        service.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && currentBatch === searchBatch) {
                // 添加類別標籤到結果中
                const labeledResults = results.map(result => ({
                    ...result,
                    categoryLabel: searchType.label
                }));
                allResults = allResults.concat(labeledResults);
            }
            
            completedSearches++;
            document.getElementById('progress').textContent = 
                `搜索進度: ${completedSearches}/${searchTypes.length} (${searchType.label})`;

            if (completedSearches === searchTypes.length) {
                processResults(allResults, location, timeLimit, cacheKey);
            }
        });
    });
}

function processResults(places, origin, timeLimit, cacheKey) {
    const results = [];
    let processedCount = 0;
    const totalPlaces = places.length;
    const batchSize = 25;
    const distanceService = new google.maps.DistanceMatrixService();

    document.getElementById('progress').textContent = `計算車程: 0/${totalPlaces}`;

    function processBatch(startIndex) {
        if (startIndex >= totalPlaces) {
            finishProcessing();
            return;
        }

        const endIndex = Math.min(startIndex + batchSize, totalPlaces);
        const currentBatch = places.slice(startIndex, endIndex);
        const destinations = currentBatch.map(place => place.geometry.location);

        distanceService.getDistanceMatrix({
            origins: [origin],
            destinations: destinations,
            travelMode: 'DRIVING'
        }, (response, status) => {
            if (status === 'OK') {
                response.rows[0].elements.forEach((element, index) => {
                    if (element.status === 'OK') {
                        const durationMinutes = Math.round(element.duration.value / 60);
                        if (durationMinutes <= timeLimit) {
                            const place = currentBatch[index];
                            const placeType = getPlaceType(place);
                            if (placeType) {
                                results.push({
                                    name: place.name,
                                    type: placeType,
                                    duration: durationMinutes
                                });
                            }
                        }
                    }
                    processedCount++;
                    document.getElementById('progress').textContent = 
                        `計算車程: ${processedCount}/${totalPlaces}`;
                });

                if (processedCount >= totalPlaces) {
                    finishProcessing();
                } else {
                    setTimeout(() => processBatch(endIndex), 200);
                }
            }
        });
    }

    function finishProcessing() {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // 儲存到緩存
        searchCache.set(cacheKey, results);
        
        displayResults(results);
    }

    processBatch(0);
}

function displayResults(results) {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';
    
    // 只按車程排序
    results.sort((a, b) => a.duration - b.duration);

    results.forEach(result => {
        const row = resultsBody.insertRow();
        row.insertCell(0).textContent = result.name;
        row.insertCell(1).textContent = result.type;
        row.insertCell(2).textContent = result.duration;
    });

    document.getElementById('loading').style.display = 'none';
    document.getElementById('resultsTable').style.display = 'table';
    document.getElementById('exportButton').style.display = 'block';
}

function getPlaceType(place) {
    // 如果已經有類別標籤，直接使用
    if (place.categoryLabel) {
        return place.categoryLabel;
    }

    const typeMapping = {
        // 住宅類
        'housing_estate': '住宅',
        'apartment': '住宅',
        'residential': '住宅',
        'house': '住宅',
        'premise': '住宅',
        'residential_area': '住宅',
        
        // 商業類
        'shopping_mall': '商場',
        'department_store': '商場',
        'store': '商場',
        'shopping_center': '商場',
        'plaza': '商場',
        
        // 酒店類
        'hotel': '酒店',
        'lodging': '酒店',
        'resort': '酒店',
        
        // 停車場
        'parking': '停車場',
        'parking_lot': '停車場',
        'parking_garage': '停車場',
        
        // 政府設施
        'government': '政府設施',
        'local_government_office': '政府設施',
        'police': '政府設施',
        'fire_station': '政府設施',
        'post_office': '政府設施',
        'school': '政府設施',
        'hospital': '政府設施',
        'library': '政府設施',
        'public_building': '政府設施'
    };

    // 檢查地點類型
    for (const type of place.types) {
        if (typeMapping[type]) {
            return typeMapping[type];
        }
    }
    
    // 檢查名稱和地址中的關鍵詞
    const name = place.name || '';
    const address = place.formatted_address || '';
    const fullText = (name + ' ' + address).toLowerCase();
    
    // 更全面的關鍵詞匹配
    if (fullText.match(/(屋苑|花園|村|邨|大廈|樓|閣|軒|園|苑|住宅)/)) return '住宅';
    if (fullText.match(/(廣場|商場|中心|plaza|centre|center|mall|商業|市場)/)) return '商場';
    if (fullText.match(/(酒店|賓館|旅館|hotel|inn|resort)/)) return '酒店';
    if (fullText.match(/(停車場|泊車|parking)/)) return '停車場';
    if (fullText.match(/(政府|市政|公共|學校|醫院|警署|消防局|郵政|圖書館)/)) return '政府設施';
    
    return '';
}

function exportToCSV() {
    const table = document.getElementById('resultsTable');
    let csv = '名稱,類型,車程（分鐘）\n';
    
    for (let i = 1; i < table.rows.length; i++) {
        const row = table.rows[i];
        const rowData = [];
        for (let j = 0; j < row.cells.length; j++) {
            rowData.push('"' + row.cells[j].textContent + '"');
        }
        csv += rowData.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', '搜索結果.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
} 