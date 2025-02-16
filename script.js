// 全局變量
let map = null;
let placesService = null;
let distanceService = null;

// 初始化函數
function initMap() {
    try {
        // 創建隱藏的地圖元素
        const mapDiv = document.createElement('div');
        mapDiv.style.cssText = 'height: 100px; width: 100px; display: none;';
        document.body.appendChild(mapDiv);

        // 初始化地圖
        map = new google.maps.Map(mapDiv, {
            center: { lat: 22.293165, lng: 113.945157 },
            zoom: 15
        });

        // 初始化服務
        placesService = new google.maps.places.PlacesService(map);
        distanceService = new google.maps.DistanceMatrixService();

        console.log('Google Maps API 初始化成功');
    } catch (error) {
        console.error('Google Maps API 初始化失敗:', error);
        updateProgress('Google Maps API 初始化失敗，請刷新頁面重試');
    }
}

// 檢查服務是否可用
function checkServices() {
    if (!map || !placesService || !distanceService) {
        updateProgress('搜索服務未準備好，請稍後再試');
        return false;
    }
    return true;
}

// 更新進度顯示
function updateProgress(message) {
    const progressDiv = document.getElementById('searchProgress');
    const detailsDiv = document.getElementById('progressDetails');
    progressDiv.style.display = 'block';
    detailsDiv.innerHTML = '正在搜尋中...';  // 只顯示"正在搜尋中..."
    console.log(message); // 保留詳細日誌在控制台
}

// 添加延遲函數
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 搜索函數
async function searchLocations() {
    if (!map || !placesService || !distanceService) {
        updateProgress('搜索服務未準備好，請稍後再試');
        return;
    }

    const coordinates = document.getElementById('coordinates').value;
    const timeRange = parseInt(document.getElementById('timeRange').value);
    const category = document.getElementById('category').value;

    // 重置進度顯示
    const detailsDiv = document.getElementById('progressDetails');
    detailsDiv.innerHTML = '正在搜尋中...';

    if (!coordinates) {
        alert('請輸入經緯度！');
        return;
    }

    try {
        const [lat, lng] = coordinates.split(',').map(coord => parseFloat(coord.trim()));
        
        if (isNaN(lat) || isNaN(lng)) {
            detailsDiv.innerHTML = '無效的經緯度格式';
            return;
        }

        updateProgress('開始搜索...');

        // 設置多個搜索半徑（以米為單位）
        const radiusList = [
            1000,  // 1公里
            2000,  // 2公里
            5000,  // 5公里
            10000, // 10公里
            20000, // 20公里
            50000  // 50公里
        ].filter(r => r <= (timeRange * 60 * 1000) / 60);

        // 搜索配置
        const searchConfig = {
            parking: {
                keywords: [
                    '停車場', '泊車場', '室內停車場', '地下停車場',
                    'car park', 'parking', 'indoor parking', 
                    'underground parking'
                ],
                excludeTerms: [
                    '路邊', '單車', '傷殘', '電單車', '臨時',
                    'motorcycle', 'bicycle', 'disabled'
                ],
                types: ['parking']
            },
            residential: {
                keywords: [
                    '屋苑', '住宅', '大廈', '樓', '苑', '村', '村屋',
                    '私人住宅', '公共住宅', 'estate', 'residential',
                    'apartment', 'housing', 'mansion', 'tower'
                ],
                types: ['establishment']
            }
        };

        const config = searchConfig[category];
        let allPlaces = new Map(); // 使用 Map 來存儲唯一的地點

        // 對每個半徑進行搜索
        for (const radius of radiusList) {
            updateProgress(`搜索半徑 ${radius/1000} 公里範圍...`);
            
            // 對每個關鍵字進行搜索
            for (const keyword of config.keywords) {
                try {
                    updateProgress(`正在搜索關鍵字: ${keyword} (半徑: ${radius/1000}公里)`);
                    
                    const request = {
                        location: new google.maps.LatLng(lat, lng),
                        radius: radius,
                        keyword: keyword,
                        type: category === 'parking' ? 'parking' : null
                    };

                    const places = await new Promise((resolve) => {
                        placesService.nearbySearch(request, (results, status) => {
                            if (status === google.maps.places.PlacesServiceStatus.OK) {
                                resolve(results);
                            } else {
                                console.warn(`搜索 "${keyword}" 狀態: ${status}`);
                                resolve([]);
                            }
                        });
                    });

                    // 將結果添加到 Map 中，使用 place_id 作為鍵以去重
                    if (places && places.length > 0) {
                        places.forEach(place => {
                            if (!allPlaces.has(place.place_id)) {
                                allPlaces.set(place.place_id, place);
                            }
                        });
                        updateProgress(`在 ${radius/1000}公里範圍內找到 ${places.length} 個地點`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error(`搜索 "${keyword}" 時出錯:`, error);
                }
            }
        }

        // 將 Map 轉換回數組
        let placesArray = Array.from(allPlaces.values());

        // 過濾
        placesArray = placesArray.filter(place => {
            if (category === 'parking') {
                const name = place.name.toLowerCase();
                return !config.excludeTerms.some(term => 
                    name.includes(term.toLowerCase())
                );
            }
            return true;
        });

        updateProgress(`過濾完成，找到 ${placesArray.length} 個有效地點`);

        if (placesArray.length === 0) {
            displayResults([]);
            return;
        }

        // 計算距離
        const batchSize = 25;
        let results = [];

        for (let i = 0; i < placesArray.length; i += batchSize) {
            const batch = placesArray.slice(i, i + batchSize);
            try {
                updateProgress(`正在計算第 ${i + 1} 至 ${Math.min(i + batchSize, placesArray.length)} 個地點的車程...`);

                const distanceResult = await new Promise((resolve, reject) => {
                    distanceService.getDistanceMatrix({
                        origins: [new google.maps.LatLng(lat, lng)],
                        destinations: batch.map(place => place.geometry.location),
                        travelMode: google.maps.TravelMode.DRIVING,
                        unitSystem: google.maps.UnitSystem.METRIC
                    }, (response, status) => {
                        if (status === 'OK') {
                            resolve(response);
                        } else {
                            reject(new Error(`距離計算失敗: ${status}`));
                        }
                    });
                });

                const batchResults = batch.map((place, index) => {
                    const element = distanceResult.rows[0].elements[index];
                    if (element.status === 'OK') {
                        const duration = element.duration.text;
                        const durationMinutes = parseInt(duration.match(/\d+/)[0]);

                        if (durationMinutes <= timeRange) {
                            return {
                                name: place.name,
                                address: place.vicinity || '無地址資訊',
                                category: category === 'parking' ? '停車場' : '住宅',
                                drivingTime: duration
                            };
                        }
                    }
                    return null;
                }).filter(result => result !== null);

                results = results.concat(batchResults);
            } catch (error) {
                console.error('距離計算錯誤:', error);
                updateProgress('部分距離計算失敗');
            }
        }

        // 排序結果
        results.sort((a, b) => {
            const timeA = parseInt(a.drivingTime.match(/\d+/)[0]);
            const timeB = parseInt(b.drivingTime.match(/\d+/)[0]);
            return timeA - timeB;
        });

        updateProgress(`搜索完成！找到 ${results.length} 個符合條件的地點`);
        displayResults(results);
    } catch (error) {
        detailsDiv.innerHTML = '搜索過程中發生錯誤';
        console.error(error);
    }
}

function displayResults(results) {
    const resultsDiv = document.getElementById('resultsTable');
    
    const table = `
        <table>
            <thead>
                <tr>
                    <th>名稱</th>
                    <th>地址</th>
                    <th>類別</th>
                    <th>車程時間</th>
                </tr>
            </thead>
            <tbody>
                ${results.map(result => `
                    <tr>
                        <td>${result.name}</td>
                        <td>${result.address}</td>
                        <td>${result.category}</td>
                        <td>${result.drivingTime}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    resultsDiv.innerHTML = table;
}

function exportToExcel() {
    const table = document.querySelector('table');
    if (!table) {
        alert('沒有可導出的數據！');
        return;
    }

    // 創建一個工作表
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        const rowData = [];
        for (const cell of cells) {
            rowData.push(cell.textContent);
        }
        csv.push(rowData.join(','));
    }

    // 下載 CSV 文件
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '搜尋結果.csv';
    link.click();
} 