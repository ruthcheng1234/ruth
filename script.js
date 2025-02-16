async function searchLocations() {
    const coordinates = document.getElementById('coordinates').value;
    const timeRange = parseInt(document.getElementById('timeRange').value);
    const category = document.getElementById('category').value;

    if (!coordinates) {
        alert('請輸入經緯度！');
        return;
    }

    const [lat, lng] = coordinates.split(',').map(coord => parseFloat(coord.trim()));
    
    try {
        // 創建地圖服務
        const placesService = new google.maps.places.PlacesService(document.createElement('div'));
        const distanceService = new google.maps.DistanceMatrixService();

        // 設置搜索半徑（以米為單位，假設平均車速60km/h）
        const radius = (timeRange * 60 * 1000) / 60; // 轉換分鐘為米

        // 設置搜索關鍵字
        const keyword = category === 'parking' ? '停車場' : 
            '屋苑|住宅|大廈|樓|苑|村|村屋|唐樓|私人住宅|公共住宅|住宅數宇|住宅協會|住宅發展|tower|house|block|私人屋苑|garden|居|estate';

        const request = {
            location: new google.maps.LatLng(lat, lng),
            radius: radius,
            keyword: keyword,
            type: category === 'parking' ? 'parking' : 'establishment'
        };

        // 搜索地點
        const places = await new Promise((resolve, reject) => {
            placesService.nearbySearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve(results);
                } else {
                    reject(new Error('搜索地點失敗'));
                }
            });
        });

        // 計算車程時間
        const destinations = places.map(place => place.geometry.location);
        const origin = new google.maps.LatLng(lat, lng);

        const distanceResult = await new Promise((resolve, reject) => {
            distanceService.getDistanceMatrix({
                origins: [origin],
                destinations: destinations,
                travelMode: google.maps.TravelMode.DRIVING,
                unitSystem: google.maps.UnitSystem.METRIC
            }, (response, status) => {
                if (status === 'OK') {
                    resolve(response);
                } else {
                    reject(new Error('計算距離失敗'));
                }
            });
        });

        // 整理結果
        const results = places.map((place, index) => {
            const duration = distanceResult.rows[0].elements[index].duration.text;
            const durationMinutes = parseInt(duration.match(/\d+/)[0]);

            // 只返回在指定時間範圍內的地點
            if (durationMinutes <= timeRange) {
                return {
                    name: place.name,
                    address: place.vicinity,
                    category: category === 'parking' ? '停車場' : '住宅',
                    drivingTime: duration
                };
            }
            return null;
        }).filter(result => result !== null);

        displayResults(results);
    } catch (error) {
        alert('搜尋過程中發生錯誤：' + error.message);
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