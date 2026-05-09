#include <iostream>
#include <vector>
#include <map>
#include <list>
#include <string>
#include <chrono>
#include <winsock2.h>
#include <ws2tcpip.h>
#include "json.hpp"

#pragma comment(lib, "Ws2_32.lib")

using json = nlohmann::json;
using namespace std;

struct Order {
    string id;
    string user_id;
    string side;
    double price;
    int quantity;
    long long timestamp;
};

class OrderBook {
public:
    map<double, list<Order>, greater<double>> bids;
    map<double, list<Order>, less<double>> asks;

    void processOrder(Order& order, int client_socket) {
        json ack = {
            {"orderId", order.id},
            {"status", "ACK"},
            {"timestamp", chrono::duration_cast<chrono::nanoseconds>(chrono::system_clock::now().time_since_epoch()).count()}
        };
        send_json(client_socket, ack);

        if (order.side == "BUY") {
            match(order, asks, client_socket);
            if (order.quantity > 0) {
                bids[order.price].push_back(order);
            }
        } else {
            match(order, bids, client_socket);
            if (order.quantity > 0) {
                asks[order.price].push_back(order);
            }
        }
    }

private:
    template<typename T>
    void match(Order& order, T& opposite_side, int client_socket) {
        auto it = opposite_side.begin();
        while (it != opposite_side.end() && order.quantity > 0) {
            double price = it->first;
            if ((order.side == "BUY" && order.price >= price) ||
                (order.side == "SELL" && order.price <= price)) {
                
                auto& orders = it->second;
                auto order_it = orders.begin();
                while (order_it != orders.end() && order.quantity > 0) {
                    Order& matched_order = *order_it;
                    int match_qty = min(order.quantity, matched_order.quantity);
                    
                    order.quantity -= match_qty;
                    matched_order.quantity -= match_qty;

                    json fill = {
                        {"orderId", order.id},
                        {"status", "FILL"},
                        {"matchId", matched_order.id},
                        {"price", price},
                        {"filledQuantity", match_qty},
                        {"remainingQuantity", order.quantity},
                        {"timestamp", chrono::duration_cast<chrono::nanoseconds>(chrono::system_clock::now().time_since_epoch()).count()}
                    };
                    send_json(client_socket, fill);

                    if (matched_order.quantity == 0) {
                        order_it = orders.erase(order_it);
                    } else {
                        ++order_it;
                    }
                }

                if (orders.empty()) {
                    it = opposite_side.erase(it);
                } else {
                    ++it;
                }
            } else {
                break;
            }
        }
    }

    void send_json(int socket, const json& j) {
        string s = j.dump() + "\n";
        send(socket, s.c_str(), (int)s.length(), 0);
    }
};

int main() {
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);

    int listen_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    
    sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(9000);

    bind(listen_socket, (sockaddr*)&server_addr, sizeof(server_addr));
    listen(listen_socket, SOMAXCONN);

    cout << "Reference Engine listening on port 9000..." << endl;

    OrderBook ob;

    while (true) {
        int client_socket = (int)accept(listen_socket, NULL, NULL);
        if (client_socket == -1) continue;

        char buffer[4096];
        string data;
        while (true) {
            int bytes_received = recv(client_socket, buffer, sizeof(buffer), 0);
            if (bytes_received <= 0) break;

            data.append(buffer, bytes_received);
            size_t pos;
            while ((pos = data.find('\n')) != string::npos) {
                string line = data.substr(0, pos);
                data.erase(0, pos + 1);

                try {
                    auto j = json::parse(line);
                    Order o;
                    o.id = j["orderId"];
                    o.user_id = j["userId"];
                    o.side = j["side"];
                    o.price = j["price"];
                    o.quantity = j["quantity"];
                    o.timestamp = j["timestamp"];

                    ob.processOrder(o, client_socket);
                } catch (...) {}
            }
        }
        closesocket(client_socket);
    }

    closesocket(listen_socket);
    WSACleanup();
    return 0;
}
