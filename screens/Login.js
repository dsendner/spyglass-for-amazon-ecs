import React from 'react';
import {
    View,
    Text,
    TextInput,
    Button,
    Picker,
    ActivityIndicator,
    StyleSheet
} from 'react-native';
import aws from '../aws';
import auth from '../auth';
import { brandColor } from '../styles';

const styles = StyleSheet.create({
    login: {
        padding: 20,
        backgroundColor: brandColor
    },
    title: {
        paddingTop: 25,
        paddingBottom: 25,
        fontWeight: 'bold',
        fontSize: 20,
        color: 'white'
    },
    inputLabel: {
        fontSize: 18,
        color: 'white'
    },
    input: {
        borderColor: 'white',
        backgroundColor: 'white',
        borderWidth: 1,
        height: 40,
        marginTop: 10,
        marginBottom: 20
    },
    picker: {
    },
    pickerItem: {
        color: 'white'
    },
    loginButton: {
        padding: 10,
        borderColor: 'white',
        borderWidth: 1,
        color: 'white'
    },
    errorMessage: {
        color: 'red'
    },
    loadingPage: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: brandColor,
        paddingTop: 20
    }
});

export default class Login extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            accessKey: '',
            secretKey: '',
            region: aws.regions[0].value,
            error: '',
            isLoading: false
        };
    }

    onLogin() {
        const {accessKey, secretKey, region} = this.state;
        const { navigation } = this.props;
        const servicesStore = navigation.getParam('servicesStore');

        this.setState({isLoading: true});

        auth.saveCredentials(accessKey, secretKey, region)
            .then(() => {
                this.setState({isLoading: false});

                return navigation.navigate('App');
            }, error => {
                this.setState({error, isLoading: false});
            });
    }

    render() {
        const { error, isLoading } = this.state;

        if(isLoading) {
            return (
                <View style={styles.loadingPage}>
                    <ActivityIndicator size="large" color="white" />
                </View>
            );
        }

        return (
            <View style={styles.login}>
                <Text style={styles.title}>Omni</Text>

                <Text style={styles.inputLabel}>Access Key</Text>
                <TextInput
                    style={styles.input}
                    value={this.state.accessKey}
                    onChangeText={(accessKey) => this.setState({accessKey})} />

                <Text style={styles.inputLabel}>Secret Key</Text>
                <TextInput
                    style={styles.input}
                    value={this.state.secretKey}
                    onChangeText={secretKey => this.setState({secretKey})} />

                <Text style={styles.inputLabel}>Region</Text>
                <Picker
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    selectedValue={this.state.region}
                    onValueChange={itemValue => this.setState({region: itemValue})}>
                    {aws.regions.map(({label, value}) => <Picker.Item key={value} label={label} value={value} styles={styles.pickerItem} />)}
                </Picker>

                <Button color="white" title="Login" onPress={() => this.onLogin()} />

                {error? <Text style={errorMessage}>{error.message}</Text> : null}
            </View>
        );
    }

}
